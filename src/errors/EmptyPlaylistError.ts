export class EmptyPlaylistError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SMILEmptyPlaylistError';
	}
}
