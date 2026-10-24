// Native regression: exercise production transitions and actual AppKit hit rectangles.
use super::*;

pub(crate) fn verify_preferences_layout(window: &WebviewWindow) {
    initialise(window).unwrap();
    let label = window.label();
    update_title_layout(
        label,
        TitlebarLayout {
            content_left: 270.0,
            content_right: 1280.0,
            viewport_width: 1280.0,
        }
        .validate()
        .unwrap(),
    )
    .unwrap();
    for can_close in [true, false] {
        for source_mode in [false, true] {
            for refresh in [false, true] {
                let document = || DocumentChrome {
                    path: None,
                    file_proxy: false,
                    dirty: false,
                    statistics_label: "5386 词".into(),
                    statistics: StatisticsSnapshot::default(),
                    always_show_word_count: true,
                    dark: false,
                    outline_panel_open: true,
                    ai_panel_open: false,
                    source_mode: Some(source_mode),
                    can_close_document: can_close,
                    untitled_name: None,
                };
                update(label, document()).unwrap();
                for _ in 0..3 {
                    set_preferences_page(label, true).unwrap();
                    CHROME.with(|registry| {
                        let registry = registry.borrow();
                        let chrome = &registry[label];
                        assert!(chrome.view.ivars().home_button.get().unwrap().isHidden());
                        assert!(chrome.outline.isHidden());
                    });
                    // Both delayed statistics and window events can run while settings is open.
                    if refresh {
                        update(label, document()).unwrap();
                        window_changed(label);
                    }
                    set_preferences_page(label, false).unwrap();
                    // Do not let another document update conceal a stale layout on return.
                    CHROME.with(|registry| {
                        let registry = registry.borrow();
                        let chrome = &registry[label];
                        chrome.view.layoutSubtreeIfNeeded();
                        let home = chrome.view.ivars().home_button.get().unwrap();
                        assert_eq!(home.isHidden(), !can_close || source_mode);
                        assert_eq!(chrome.outline.isHidden(), source_mode);
                        assert_eq!(
                            chrome.view.ivars().source_button.get().unwrap().isHidden(),
                            !source_mode
                        );
                        let mut visible: Vec<&NSButton> = Vec::new();
                        if !home.isHidden() {
                            visible.push(home);
                        }
                        for button in chrome.view.ivars().actions.get().unwrap() {
                            if !button.isHidden() {
                                visible.push(button);
                            }
                        }
                        for pair in visible.windows(2) {
                            let left = pair[0].frame();
                            let right = pair[1].frame();
                            assert!(
                                left.origin.x + left.size.width <= right.origin.x,
                                "settings return overlaps {:?} and {:?}; refresh={refresh}",
                                left,
                                right
                            );
                        }
                        for button in visible {
                            let frame = button.frame();
                            let point = NSPoint::new(
                                frame.origin.x + frame.size.width / 2.0,
                                frame.origin.y + frame.size.height / 2.0,
                            );
                            // SAFETY: the retained window owns this view and its ancestors.
                            let parent = unsafe { chrome.view.superview() };
                            let point = chrome.view.convertPoint_toView(point, parent.as_deref());
                            let hit = chrome.view.hitTest(point).expect("visible titlebar target");
                            assert_eq!(
                                Retained::as_ptr(&hit).cast::<()>(),
                                std::ptr::from_ref(button).cast::<()>(),
                                "each restored icon must receive its own click"
                            );
                        }
                    });
                }
            }
        }
    }
    release(label);
}
