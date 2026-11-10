### Fixed

- (public) Custom endpoint reports are delivered on older devices without native `fetch` (e.g. Chrome 38 based webOS), instead of failing into the offline queue on every attempt
- (public) The player no longer freezes with new content never appearing after a SMIL content update that adds a `repeatCount="indefinite"` sequence while the new media is still downloading; previously only a restart recovered it
