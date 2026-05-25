import {defineConfig} from '@zaiusinc/app-sdk';
import {cmsUiExtensions} from '@zaiusinc/ocp-cms-ui-extensions-app-sdk';

export default defineConfig({
  plugins: [cmsUiExtensions()]
});
