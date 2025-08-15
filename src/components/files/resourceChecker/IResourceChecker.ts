export interface IResourceChecker {
	start(): void;
	stop(): Promise<void>;
}
