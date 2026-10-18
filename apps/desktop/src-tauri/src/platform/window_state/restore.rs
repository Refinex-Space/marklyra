//! Pure restoration state machine. Native setter acknowledgements alone are
//! insufficient: Tao queues AppKit work, so only observed bounds can complete it.
use super::geometry::{NormalGeometry, SavedState, SCHEMA};

pub(super) enum Observation {
    Normal(NormalGeometry),
    Maximized,
    Ignore,
}
pub(super) enum Action {
    Wait,
    Maximize,
    Finish(Option<SavedState>),
}
enum Phase {
    Normal,
    Maximizing(NormalGeometry),
}
pub(super) struct PendingRestore {
    expected: SavedState,
    phase: Phase,
    pub last_actual: Option<SavedState>,
}
impl PendingRestore {
    pub fn new(expected: SavedState, actual: Option<SavedState>) -> Self {
        Self {
            expected,
            phase: Phase::Normal,
            last_actual: actual,
        }
    }
    pub fn advance(&mut self, observed: Observation, expired: bool) -> Action {
        match (&self.phase, observed) {
            (Phase::Normal, Observation::Normal(normal)) => {
                let actual = SavedState {
                    schema: SCHEMA,
                    normal: normal.clone(),
                    maximized: false,
                };
                self.last_actual = Some(actual.clone());
                if matches_target(&normal, &self.expected.normal) {
                    if self.expected.maximized && !expired {
                        self.phase = Phase::Maximizing(normal);
                        Action::Maximize
                    } else {
                        Action::Finish(Some(actual))
                    }
                } else if expired {
                    Action::Finish(Some(actual))
                } else {
                    Action::Wait
                }
            }
            (Phase::Maximizing(normal), Observation::Maximized) => {
                let state = SavedState {
                    schema: SCHEMA,
                    normal: normal.clone(),
                    maximized: true,
                };
                self.last_actual = Some(state.clone());
                Action::Finish(Some(state))
            }
            (Phase::Maximizing(_), Observation::Normal(normal)) if expired => {
                Action::Finish(Some(SavedState {
                    schema: SCHEMA,
                    normal,
                    maximized: false,
                }))
            }
            (_, _) if expired => Action::Finish(None),
            _ => Action::Wait,
        }
    }
    /// Closing and failed API calls never issue another setter. Retain only
    /// actual bounds (or a previously observed normal frame for native maximize).
    pub fn cancel(&self, observed: Option<Observation>) -> Option<SavedState> {
        match observed {
            Some(Observation::Normal(normal)) => Some(SavedState {
                schema: SCHEMA,
                normal,
                maximized: false,
            }),
            Some(Observation::Maximized) => match &self.phase {
                Phase::Maximizing(normal) => Some(SavedState {
                    schema: SCHEMA,
                    normal: normal.clone(),
                    maximized: true,
                }),
                Phase::Normal => None,
            },
            _ => self.last_actual.clone(),
        }
    }
}
fn matches_target(actual: &NormalGeometry, expected: &NormalGeometry) -> bool {
    let tolerance = 2.0 / expected.display.scale;
    actual.display.work == expected.display.work
        && (actual.display.scale - expected.display.scale).abs() < 0.000_001
        && (actual.width - expected.width).abs() <= tolerance
        && (actual.height - expected.height).abs() <= tolerance
        && (actual.offset_x - expected.offset_x).abs() <= tolerance
        && (actual.offset_y - expected.offset_y).abs() <= tolerance
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::window_state::geometry::{Display, PhysicalArea};
    fn state(width: f64, maximized: bool) -> SavedState {
        SavedState {
            schema: SCHEMA,
            maximized,
            normal: NormalGeometry {
                width,
                height: 600.0,
                offset_x: 20.0,
                offset_y: 30.0,
                display: Display {
                    name: Some("screen".into()),
                    scale: 2.0,
                    work: PhysicalArea {
                        x: 0,
                        y: 40,
                        width: 2880,
                        height: 1800,
                    },
                },
            },
        }
    }
    #[test]
    fn asynchronous_old_geometry_cannot_complete_or_maximize() {
        let mut restore = PendingRestore::new(state(900.0, true), Some(state(1180.0, false)));
        assert!(matches!(
            restore.advance(Observation::Normal(state(1180.0, false).normal), false),
            Action::Wait
        ));
        assert_eq!(restore.last_actual.unwrap().normal.width, 1180.0);
    }
    #[test]
    fn maximizes_only_after_geometry_confirmation_and_keeps_that_normal_frame() {
        let mut restore = PendingRestore::new(state(900.0, true), None);
        assert!(matches!(
            restore.advance(Observation::Normal(state(900.0, false).normal), false),
            Action::Maximize
        ));
        assert!(matches!(
            restore.advance(Observation::Normal(state(1400.0, false).normal), false),
            Action::Wait
        ));
        let Action::Finish(Some(result)) = restore.advance(Observation::Maximized, false) else {
            panic!("Missing observed maximize");
        };
        assert_eq!(result, state(900.0, true));
    }
    #[test]
    fn timeout_uses_actual_geometry_without_a_late_maximize() {
        let mut restore = PendingRestore::new(state(900.0, true), None);
        let Action::Finish(Some(actual)) =
            restore.advance(Observation::Normal(state(1020.0, false).normal), true)
        else {
            panic!("Missing actual geometry");
        };
        assert_eq!(actual, state(1020.0, false));
        let mut matched = PendingRestore::new(state(900.0, true), None);
        assert!(matches!(
            matched.advance(Observation::Normal(state(900.0, false).normal), true),
            Action::Finish(Some(_))
        ));
    }
    #[test]
    fn timeout_without_normal_evidence_never_persists_the_plan() {
        let mut restore = PendingRestore::new(state(900.0, true), None);
        assert!(matches!(
            restore.advance(Observation::Ignore, true),
            Action::Finish(None)
        ));
    }
    #[test]
    fn close_uses_real_partial_geometry_and_does_not_return_an_action() {
        let restore = PendingRestore::new(state(900.0, true), None);
        assert_eq!(
            restore.cancel(Some(Observation::Normal(state(1020.0, false).normal))),
            Some(state(1020.0, false))
        );
        assert!(restore.cancel(Some(Observation::Maximized)).is_none());
    }
    #[test]
    fn close_while_maximizing_uses_confirmed_normal_bounds() {
        let mut restore = PendingRestore::new(state(900.0, true), None);
        restore.advance(Observation::Normal(state(900.0, false).normal), false);
        assert_eq!(
            restore.cancel(Some(Observation::Maximized)),
            Some(state(900.0, true))
        );
    }
}
