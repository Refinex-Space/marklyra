use super::{MarkdownPreferenceChange, MarkdownPreferences};
pub(super) type Store = crate::preferences_store::Store<MarkdownPreferences>;
impl crate::preferences_store::PreferenceRecord for MarkdownPreferences {
    fn validate(&self) -> Result<(), String> {
        MarkdownPreferences::validate(self)
    }
}
impl Store {
    pub fn put(
        &self,
        expected: u64,
        change: MarkdownPreferenceChange,
    ) -> Result<MarkdownPreferences, String> {
        self.transaction(|state| {
            state.apply(expected, change)?;
            Ok((state.clone(), true))
        })
    }
}
