export interface IMasterStatusProvider {
	isMaster(): Promise<boolean>;
	onMasterChange(callback: (isMaster: boolean) => void): void;
}
