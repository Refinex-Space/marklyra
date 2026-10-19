use super::*;

#[test]
fn rejects_non_http_and_credentials_before_starting_a_process() {
    for url in [
        "file:///tmp/private.png",
        "ftp://127.0.0.1/image.png",
        "http://user:password@127.0.0.1/image.png",
        "http://@127.0.0.1/image.png",
        "http://127.0.0.1/image.png\n",
        "not a URL",
    ] {
        let error = download_image(url, Arc::new(AtomicBool::new(false))).unwrap_err();
        assert!(!error.contains(url));
        assert!(error.contains("HTTP"));
    }
}

#[cfg(any(target_os = "macos", windows))]
mod curl {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::atomic::Ordering,
        thread,
        time::{Duration, Instant},
    };

    fn serve(
        reply: impl FnOnce(std::net::TcpStream) + Send + 'static,
    ) -> (String, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let address = listener.local_addr().unwrap();
        let thread = thread::spawn(move || {
            let started = Instant::now();
            let mut socket = loop {
                match listener.accept() {
                    Ok((socket, _)) => break socket,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        assert!(started.elapsed() < Duration::from_secs(5));
                        thread::sleep(Duration::from_millis(5));
                    }
                    Err(error) => panic!("loopback fixture accept: {error}"),
                }
            };
            socket.set_nonblocking(false).unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut request = Vec::new();
            let mut byte = [0_u8; 1];
            while !request.ends_with(b"\r\n\r\n") {
                assert!(request.len() < 8192);
                socket.read_exact(&mut byte).unwrap();
                request.push(byte[0]);
            }
            assert!(request.starts_with(b"GET /image.png HTTP/"));
            assert!(!request.windows(6).any(|part| part == b"Cookie"));
            assert!(!request.windows(13).any(|part| part == b"Authorization"));
            reply(socket);
        });
        (format!("http://{address}/image.png"), thread)
    }

    #[test]
    fn downloads_loopback_bytes_and_does_not_return_http_errors_as_images() {
        let bytes = b"\x89PNG\r\n\x1a\nfixture";
        let (url, server) = serve(move |mut socket| {
            write!(
                socket,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                bytes.len()
            )
            .unwrap();
            socket.write_all(bytes).unwrap();
        });
        assert_eq!(
            download_image(&url, Arc::new(AtomicBool::new(false))).unwrap(),
            bytes
        );
        server.join().unwrap();
        let (url, server) = serve(|mut socket| {
            socket
                .write_all(
                    b"HTTP/1.1 404 Not Found\r\nContent-Length: 4\r\nConnection: close\r\n\r\nfail",
                )
                .unwrap();
        });
        assert!(download_image(&url, Arc::new(AtomicBool::new(false))).is_err());
        server.join().unwrap();
    }

    #[test]
    fn rejects_redirect_without_connecting_to_the_location() {
        let unused = TcpListener::bind("127.0.0.1:0").unwrap();
        unused.set_nonblocking(true).unwrap();
        let target = unused.local_addr().unwrap();
        let (url, server) = serve(move |mut socket| {
            write!(socket, "HTTP/1.1 302 Found\r\nLocation: http://{target}/not-requested\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
        });
        let error = download_image(&url, Arc::new(AtomicBool::new(false))).unwrap_err();
        assert!(error.contains("重定向"));
        assert!(
            matches!(unused.accept(), Err(error) if error.kind() == std::io::ErrorKind::WouldBlock)
        );
        server.join().unwrap();
    }

    #[test]
    fn accepts_exactly_the_stream_limit() {
        let (url, server) = serve(|mut socket| {
            write!(
                socket,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                MAX_IMAGE_BYTES
            )
            .unwrap();
            let chunk = [b'x'; 32 * 1024];
            for _ in 0..MAX_IMAGE_BYTES / chunk.len() {
                socket.write_all(&chunk).unwrap();
            }
        });
        let bytes = download_image(&url, Arc::new(AtomicBool::new(false))).unwrap();
        assert_eq!(bytes.len(), MAX_IMAGE_BYTES);
        assert!(bytes.iter().all(|byte| *byte == b'x'));
        server.join().unwrap();
    }

    #[test]
    fn enforces_stream_limit_without_a_content_length() {
        let (url, server) = serve(|mut socket| {
            socket
                .write_all(b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n")
                .unwrap();
            let chunk = [b'x'; 32 * 1024];
            for _ in 0..300 {
                if socket.write_all(&chunk).is_err() {
                    break;
                }
            }
        });
        let result = download_image(&url, Arc::new(AtomicBool::new(false)));
        assert!(matches!(&result, Err(error) if error.contains("8 MiB")));
        server.join().unwrap();
    }

    #[test]
    fn cancellation_kills_and_reaps_only_the_owned_download() {
        let cancelled = Arc::new(AtomicBool::new(false));
        let trigger = cancelled.clone();
        let (url, server) = serve(move |mut socket| {
            socket
                .write_all(b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n")
                .unwrap();
            trigger.store(true, Ordering::Release);
            let mut byte = [0_u8; 1];
            // The function waits for its own child, which closes its connection: a clean FIN
            // on macOS, an abortive reset when Windows terminates curl.exe.
            match socket.read(&mut byte) {
                Ok(count) => assert_eq!(count, 0),
                Err(error) => assert_eq!(error.kind(), std::io::ErrorKind::ConnectionReset),
            }
        });
        let started = Instant::now();
        let error = download_image(&url, cancelled).unwrap_err();
        assert!(error.contains("取消"));
        assert!(started.elapsed() < Duration::from_secs(3));
        server.join().unwrap();
    }

    #[test]
    fn already_cancelled_download_makes_no_connection() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let url = format!("http://{}/image.png", listener.local_addr().unwrap());
        let error = download_image(&url, Arc::new(AtomicBool::new(true))).unwrap_err();
        assert!(error.contains("取消"));
        assert!(
            matches!(listener.accept(), Err(error) if error.kind() == std::io::ErrorKind::WouldBlock)
        );
    }
}
