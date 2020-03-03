# signageOS sandbox Applet

- The purpose of this repository is to show very simple project sandbox for creation of an applet with usage of front-applet lib sos API.

## Webpack + TypeScript
- Look at `package.json` devDependencies to see what is necessary to install using npm
- Look at `webpack.config.js` to see basic configuration of webpack using `awesome-typescript-loader` to transpile all code into one javascript file.
- Look at `tsconfig.json` to see basic configuration of typescript project. At least compilerOptions.types must contains @signageos/front-applet. Library is using @signageos/front-applet only for types declaration for typescript. In real applet is used sos API (front-applet) selected in BOX > Applet Detail > sos API select box
- To build applet use `npm run prepare`. Output file will appear as index.js in project root. The built content of this javascript file copy to BOX > Applet Detail editor inside `<script type="application/javascript"></script>` tag instead of sample JS code. Do not forgot change type `application/ecmascript` to `application/javascript` because TypeScript automatically transpile code to ES5, so you don't need to transpile it twice.
