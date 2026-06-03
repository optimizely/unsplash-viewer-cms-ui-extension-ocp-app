import {defineConfig} from '@zaiusinc/app-sdk';
import {cmsUiExtensions} from '@optimizely/ocp-cms-ui-extensions-sdk';

export default defineConfig({
  plugins: [cmsUiExtensions()]
});
