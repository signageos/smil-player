import Video from '@signageos/front-applet/es6/FrontApplet/Video/Video';
import Stream from '@signageos/front-applet/es6/FrontApplet/Stream/Stream';
import Sync from '@signageos/front-applet/es6/FrontApplet/Sync/Sync';
import FileSystem from '@signageos/front-applet/es6/FrontApplet/FileSystem/FileSystem';
import Management from '@signageos/front-applet/es6/FrontApplet/Management/Management';
import Command from '@signageos/front-applet/es6/FrontApplet/Command/Command';
import Hardware from '@signageos/front-applet/es6/FrontApplet/Hardware/Hardware';
import ProofOfPlay from '@signageos/front-applet/es6/FrontApplet/ProofOfPlay/ProofOfPlay';

export interface ISos {
	readonly config: Record<string, number | string | boolean>;
	readonly video: Video;
	readonly stream: Stream;
	readonly sync: Sync;
	readonly fileSystem: FileSystem;
	readonly management: Management;
	readonly command: Command;
	readonly hardware: Hardware;
	readonly proofOfPlay: ProofOfPlay;
	onReady(listener?: () => void): Promise<void>;
}
