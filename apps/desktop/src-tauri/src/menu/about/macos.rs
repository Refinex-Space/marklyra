use objc2::{runtime::AnyObject, AnyThread, MainThreadMarker};
use objc2_app_kit::{
    NSAboutPanelOptionApplicationIcon, NSAboutPanelOptionApplicationName,
    NSAboutPanelOptionApplicationVersion, NSAboutPanelOptionCredits, NSAboutPanelOptionVersion,
    NSApplication, NSColor, NSFont, NSFontAttributeName, NSForegroundColorAttributeName, NSImage,
    NSLinkAttributeName, NSMutableParagraphStyle, NSParagraphStyleAttributeName, NSTextAlignment,
};
use objc2_foundation::{
    ns_string, NSData, NSDictionary, NSMutableAttributedString, NSRange, NSSize, NSString, NSURL,
};
use tauri::{AppHandle, Runtime};

/// Apply after installing the application menu: Muda forces icon sizes to 18 pt.
pub(super) fn configure_menu_icon() -> Result<(), String> {
    let mtm = MainThreadMarker::new().ok_or("Menu icons require the main thread")?;
    let item = NSApplication::sharedApplication(mtm)
        .mainMenu()
        .and_then(|menu| menu.itemAtIndex(0))
        .and_then(|item| item.submenu())
        .and_then(|menu| menu.itemWithTitle(ns_string!("关于 MarkLyra")))
        .ok_or("About menu item is missing")?;
    let image = NSImage::imageWithSystemSymbolName_accessibilityDescription(
        ns_string!("info.circle"),
        None,
    )
    .ok_or("Information symbol is unavailable")?;
    image.setSize(NSSize::new(14.0, 14.0));
    // AppKit supplies the menu's light/dark, highlighted and disabled colors.
    image.setTemplate(true);
    item.setImage(Some(&image));
    Ok(())
}

pub(super) fn show<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let mtm = MainThreadMarker::new().ok_or("About must open on the main thread")?;
    let name = NSString::from_str(super::NAME);
    let version = NSString::from_str(&app.package_info().version.to_string());
    // An empty build number prevents AppKit from repeating the release version.
    let build = ns_string!("");
    let copyright = NSString::from_str(super::COPYRIGHT);
    let data = NSData::with_bytes(super::ICON);
    let icon = NSImage::initWithData(NSImage::alloc(), &data).ok_or("Invalid application icon")?;
    let credits = credits();
    // SAFETY: AppKit constants are immutable; each option has its documented
    // object type and stays alive for the synchronous call on the main thread.
    unsafe {
        let options = NSDictionary::<NSString, AnyObject>::from_slices(
            &[
                NSAboutPanelOptionApplicationName,
                NSAboutPanelOptionApplicationVersion,
                NSAboutPanelOptionVersion,
                NSAboutPanelOptionApplicationIcon,
                NSAboutPanelOptionCredits,
                ns_string!("Copyright"),
            ],
            &[
                name.as_ref(),
                version.as_ref(),
                build.as_ref(),
                icon.as_ref(),
                credits.as_ref(),
                copyright.as_ref(),
            ],
        );
        NSApplication::sharedApplication(mtm).orderFrontStandardAboutPanelWithOptions(&options);
    }
    Ok(())
}

fn credits() -> objc2::rc::Retained<NSMutableAttributedString> {
    let text = NSString::from_str(&format!(
        "{}\n\nGitHub · Refinex-Space/marklyra",
        super::DESCRIPTION
    ));
    let credits =
        NSMutableAttributedString::initWithString(NSMutableAttributedString::alloc(), &text);
    let paragraph = NSMutableParagraphStyle::new();
    paragraph.setAlignment(NSTextAlignment::Center);
    paragraph.setLineSpacing(4.0);
    let font = NSFont::systemFontOfSize(12.0);
    let color = NSColor::secondaryLabelColor();
    let all = NSRange::new(0, credits.length());
    let link_start = super::DESCRIPTION.encode_utf16().count() + 2;
    let link = NSRange::new(link_start, credits.length() - link_start);
    let url = NSURL::URLWithString(&NSString::from_str(super::REPOSITORY))
        .expect("fixed repository URL must be valid");
    // SAFETY: Ranges use UTF-16 lengths; all attributes have AppKit's expected
    // value types. Semantic colors follow the system's light/dark appearance.
    unsafe {
        credits.addAttribute_value_range(NSParagraphStyleAttributeName, &paragraph, all);
        credits.addAttribute_value_range(NSFontAttributeName, &font, all);
        credits.addAttribute_value_range(NSForegroundColorAttributeName, &color, all);
        credits.addAttribute_value_range(NSLinkAttributeName, &url, link);
    }
    credits
}

#[cfg(test)]
mod tests {
    use super::*;
    use objc2_foundation::NSAttributedString;

    #[test]
    fn credits_keep_description_and_repository_label() {
        let credits: objc2::rc::Retained<NSAttributedString> = credits().into_super();
        assert_eq!(
            credits.string().to_string(),
            format!(
                "{}\n\nGitHub · Refinex-Space/marklyra",
                super::super::DESCRIPTION
            )
        );
        // Check the real attributed link, including the UTF-16 boundary after Chinese text.
        let start = super::super::DESCRIPTION.encode_utf16().count() + 2;
        let link = unsafe {
            credits.attribute_atIndex_effectiveRange(
                NSLinkAttributeName,
                start,
                std::ptr::null_mut(),
            )
        }
        .expect("repository label must be a link")
        .downcast::<NSURL>()
        .expect("link must contain a URL");
        assert_eq!(
            link.absoluteString().unwrap().to_string(),
            super::super::REPOSITORY
        );
    }
}
