import { SMILFileObject } from '../../models/filesModels';

export interface IXmlParser {
	processSmilXml: (xmlFile: string) => Promise<SMILFileObject>;
}
