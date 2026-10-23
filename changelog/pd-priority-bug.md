### Fixed

- (public) Custom endpoint reports carry the `recordedAt` ISO-8601 timestamp again (alongside `time`), so endpoints that validated on the pre-4.0 field accept 4.x reports instead of rejecting them with 4xx and leaving them in the offline retry queue
