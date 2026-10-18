use serde::{Deserialize, Serialize};

pub(super) const SCHEMA: u32 = 1;
const MIN_WIDTH: f64 = 700.0;
const MIN_HEIGHT: f64 = 480.0;
const MAX_LOGICAL: f64 = 32_768.0;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct PhysicalArea {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Display {
    pub name: Option<String>,
    pub work: PhysicalArea,
    pub scale: f64,
}
impl Display {
    pub fn valid(&self) -> bool {
        self.scale.is_finite()
            && (0.25..=8.0).contains(&self.scale)
            && (1..=262_144).contains(&self.work.width)
            && (1..=262_144).contains(&self.work.height)
            && i64::from(self.work.x).abs() <= 10_000_000
            && i64::from(self.work.y).abs() <= 10_000_000
            && self.name.as_ref().is_none_or(|name| name.len() <= 512)
    }
}

/// Sizes are client-area logical pixels. Offsets are measured from this
/// display's physical work-area origin, then divided by its own scale.
/// Global desktop coordinates are never divided by a per-display scale.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct NormalGeometry {
    pub width: f64,
    pub height: f64,
    pub offset_x: f64,
    pub offset_y: f64,
    pub display: Display,
}
impl NormalGeometry {
    pub fn valid(&self) -> bool {
        self.display.valid()
            && [self.width, self.height, self.offset_x, self.offset_y]
                .into_iter()
                .all(f64::is_finite)
            && (1.0..=MAX_LOGICAL).contains(&self.width)
            && (1.0..=MAX_LOGICAL).contains(&self.height)
            && self.offset_x.abs() <= MAX_LOGICAL
            && self.offset_y.abs() <= MAX_LOGICAL
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SavedState {
    pub schema: u32,
    pub normal: NormalGeometry,
    pub maximized: bool,
}
impl SavedState {
    pub fn valid(&self) -> bool {
        self.schema == SCHEMA && self.normal.valid()
    }
}

pub(super) fn capture(
    position: (i32, i32),
    inner_size: (u32, u32),
    scale: f64,
    display: Display,
) -> Option<NormalGeometry> {
    if !display.valid() || !scale.is_finite() || (scale - display.scale).abs() > 0.000_001 {
        return None;
    }
    let value = NormalGeometry {
        width: f64::from(inner_size.0) / scale,
        height: f64::from(inner_size.1) / scale,
        offset_x: (f64::from(position.0) - f64::from(display.work.x)) / scale,
        offset_y: (f64::from(position.1) - f64::from(display.work.y)) / scale,
        display,
    };
    value.valid().then_some(value)
}

pub(super) enum PositionCommand {
    Logical(f64, f64),
    Physical(i32, i32),
}
pub(super) fn position_command(plan: &RestorePlan, cocoa: bool) -> PositionCommand {
    if cocoa {
        // Tao's AppKit monitor coordinates are logical desktop origins scaled
        // by each monitor's factor; set_outer_position otherwise divides by the
        // *current window* factor. Pass its true logical desktop position.
        PositionCommand::Logical(
            f64::from(plan.x) / plan.state.normal.display.scale,
            f64::from(plan.y) / plan.state.normal.display.scale,
        )
    } else {
        PositionCommand::Physical(plan.x, plan.y)
    }
}

pub(super) struct RestorePlan {
    pub x: i32,
    pub y: i32,
    pub state: SavedState,
}

/// Only normal bounds are clamped. Native maximize is applied afterwards.
/// If a work area is smaller than the app's existing minimum, retain that
/// minimum and keep the titlebar/top-left reachable instead of hiding it.
pub(super) fn restore(
    saved: &SavedState,
    displays: &[Display],
    primary: Option<&Display>,
    decoration: (f64, f64),
) -> Option<RestorePlan> {
    if !saved.valid() {
        return None;
    }
    let valid: Vec<&Display> = displays.iter().filter(|display| display.valid()).collect();
    let by_name: Vec<_> = valid
        .iter()
        .copied()
        .filter(|display| {
            saved.normal.display.name.is_some() && display.name == saved.normal.display.name
        })
        .collect();
    let matched = if by_name.len() == 1 {
        by_name.first().copied()
    } else {
        valid.iter().copied().find(|display| {
            display.work == saved.normal.display.work
                && (display.scale - saved.normal.display.scale).abs() < 0.000_001
        })
    };
    let display = matched
        .or_else(|| {
            primary.and_then(|primary| valid.iter().copied().find(|display| *display == primary))
        })
        .or_else(|| valid.first().copied())?;
    let safe_decoration = |value: f64| {
        if value.is_finite() {
            value.clamp(0.0, 256.0)
        } else {
            0.0
        }
    };
    let border_width = safe_decoration(decoration.0);
    let border_height = safe_decoration(decoration.1);
    let work_width = f64::from(display.work.width) / display.scale;
    let work_height = f64::from(display.work.height) / display.scale;
    let width = saved
        .normal
        .width
        .clamp(MIN_WIDTH, (work_width - border_width).max(MIN_WIDTH));
    let height = saved
        .normal
        .height
        .clamp(MIN_HEIGHT, (work_height - border_height).max(MIN_HEIGHT));
    let max_x = (work_width - width - border_width).max(0.0);
    let max_y = (work_height - height - border_height).max(0.0);
    let offset_x = if matched.is_some() {
        saved.normal.offset_x.clamp(0.0, max_x)
    } else {
        max_x / 2.0
    };
    let offset_y = if matched.is_some() {
        saved.normal.offset_y.clamp(0.0, max_y)
    } else {
        max_y / 2.0
    };
    Some(RestorePlan {
        x: (f64::from(display.work.x) + offset_x * display.scale).round() as i32,
        y: (f64::from(display.work.y) + offset_y * display.scale).round() as i32,
        state: SavedState {
            schema: SCHEMA,
            normal: NormalGeometry {
                width,
                height,
                offset_x,
                offset_y,
                display: display.clone(),
            },
            maximized: saved.maximized,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    pub(super) fn display(name: &str, x: i32, width: u32, height: u32, scale: f64) -> Display {
        Display {
            name: Some(name.into()),
            work: PhysicalArea {
                x,
                y: 40,
                width,
                height,
            },
            scale,
        }
    }
    fn saved(display: Display) -> SavedState {
        SavedState {
            schema: SCHEMA,
            normal: NormalGeometry {
                width: 900.0,
                height: 600.0,
                offset_x: 100.0,
                offset_y: 80.0,
                display,
            },
            maximized: false,
        }
    }
    #[test]
    fn native_position_adapter_uses_cocoa_points_but_windows_physical_pixels() {
        let plan = RestorePlan {
            x: 3200,
            y: 200,
            state: saved(display("screen", 3000, 2560, 1440, 2.0)),
        };
        assert!(matches!(
            position_command(&plan, true),
            PositionCommand::Logical(1600.0, 100.0)
        ));
        assert!(matches!(
            position_command(&plan, false),
            PositionCommand::Physical(3200, 200)
        ));
    }

    #[test]
    fn captures_physical_geometry_relative_to_its_monitor() {
        let screen = display("right", 3000, 2560, 1440, 2.0);
        let value = capture((3200, 200), (1800, 1200), 2.0, screen).unwrap();
        assert_eq!((value.width, value.height), (900.0, 600.0));
        assert_eq!((value.offset_x, value.offset_y), (100.0, 80.0));
    }
    #[test]
    fn mixed_dpi_change_scales_offsets_but_not_global_origins() {
        let old = saved(display("right", 3000, 2560, 1440, 2.0));
        let screen = display("right", 1920, 1920, 1080, 1.0);
        let result = restore(&old, &[screen], None, (0.0, 30.0)).unwrap();
        assert_eq!((result.x, result.y), (2020, 120));
        assert_eq!(
            (result.state.normal.width, result.state.normal.height),
            (900.0, 600.0)
        );
    }
    #[test]
    fn negative_monitor_origins_are_valid_and_not_clamped_to_primary() {
        let screen = display("left", -2560, 2560, 1440, 2.0);
        let result = restore(&saved(screen.clone()), &[screen], None, (0.0, 20.0)).unwrap();
        assert_eq!((result.x, result.y), (-2360, 200));
    }
    #[test]
    fn removed_monitor_centers_on_primary_and_constrains_normal_size() {
        let mut old = saved(display("removed", -8000, 7680, 4320, 2.0));
        old.normal.width = 2500.0;
        old.normal.height = 1800.0;
        old.maximized = true;
        let primary = display("primary", 0, 1920, 1080, 1.0);
        let result = restore(
            &old,
            std::slice::from_ref(&primary),
            Some(&primary),
            (16.0, 40.0),
        )
        .unwrap();
        assert_eq!((result.x, result.y), (0, 40));
        assert_eq!(
            (result.state.normal.width, result.state.normal.height),
            (1904.0, 1040.0)
        );
        assert!(result.state.maximized);
    }
    #[test]
    fn offscreen_offsets_and_smaller_resolution_keep_titlebar_reachable() {
        let mut old = saved(display("screen", 0, 3840, 2160, 1.0));
        old.normal.offset_x = 8000.0;
        old.normal.offset_y = -200.0;
        let current = display("screen", 0, 1280, 720, 1.0);
        let result = restore(&old, &[current], None, (16.0, 30.0)).unwrap();
        assert_eq!((result.x, result.y), (364, 40));
    }
    #[test]
    fn extremely_small_display_keeps_existing_app_minimum_and_top_left() {
        let current = display("small", 0, 640, 400, 1.0);
        let result = restore(&saved(current.clone()), &[current], None, (0.0, 30.0)).unwrap();
        assert_eq!((result.x, result.y), (0, 40));
        assert_eq!(
            (result.state.normal.width, result.state.normal.height),
            (700.0, 480.0)
        );
    }
    #[test]
    fn rejects_invalid_data_and_unavailable_displays() {
        let current = display("screen", 0, 1920, 1080, 1.0);
        let mut old = saved(current.clone());
        assert!(restore(&old, &[], None, (0.0, 0.0)).is_none());
        old.normal.width = f64::NAN;
        assert!(restore(&old, std::slice::from_ref(&current), None, (0.0, 0.0)).is_none());
        old.normal.width = 900.0;
        old.schema = 99;
        assert!(restore(&old, std::slice::from_ref(&current), None, (0.0, 0.0)).is_none());
        assert!(capture((0, 0), (100, 100), 2.0, current).is_none());
    }
    #[test]
    fn duplicate_monitor_names_use_exact_geometry_instead_of_first_name() {
        let a = display("same", 0, 1920, 1080, 1.0);
        let b = display("same", 1920, 1920, 1080, 1.0);
        let result = restore(&saved(b.clone()), &[a, b], None, (0.0, 20.0)).unwrap();
        assert_eq!(result.x, 2020);
    }
}
