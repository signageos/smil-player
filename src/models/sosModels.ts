export interface ISosVideo {
	play(uri: string, x: number, y: number, width: number, height: number): Promise<void>;
	prepare(uri: string, x: number, y: number, width: number, height: number, options?: object): Promise<void>;
	stop(uri: string, x: number, y: number, width: number, height: number): Promise<void>;
	onceEnded(uri: string, x: number, y: number, width: number, height: number): Promise<void>;
}

export interface ISosStream {
	play(uri: string, x: number, y: number, width: number, height: number, options?: object): Promise<void>;
	prepare(uri: string, x: number, y: number, width: number, height: number, options?: object): Promise<void>;
	stop(uri: string, x: number, y: number, width: number, height: number): Promise<void>;
}

export interface ISos {
	readonly config: Record<string, number | string | boolean>;
	readonly video: ISosVideo;
	readonly stream: ISosStream;
}
