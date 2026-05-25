import {
  AuthorizationGrantResult,
  CanUninstallResult,
  Lifecycle as AppLifecycle,
  LifecycleResult,
  LifecycleSettingsResult,
  logger,
  storage,
  SubmittedFormData,
  Request as AppRequest,
} from '@zaiusinc/app-sdk';
import {UnsplashError, validateAccessKey} from '../lib/unsplash';

export class Lifecycle extends AppLifecycle {
  public async onInstall(): Promise<LifecycleResult> {
    return {success: true};
  }

  public async onUpgrade(_fromVersion: string): Promise<LifecycleResult> {
    return {success: true};
  }

  public async onFinalizeUpgrade(_fromVersion: string): Promise<LifecycleResult> {
    return {success: true};
  }

  public async onAfterUpgrade(): Promise<LifecycleResult> {
    return {success: true};
  }

  public async canUninstall(): Promise<CanUninstallResult> {
    return {uninstallable: true};
  }

  public async onUninstall(): Promise<LifecycleResult> {
    return {success: true};
  }

  public async onSettingsForm(
    section: string,
    action: string,
    formData: SubmittedFormData,
  ): Promise<LifecycleSettingsResult> {
    const result = new LifecycleSettingsResult();

    if (section === 'credentials' && action === 'saveCredentials') {
      const accessKey = typeof formData.accessKey === 'string' ? formData.accessKey.trim() : '';

      if (!accessKey) {
        await storage.settings.put('credentials', {accessKey: ''});
        return result.addToast(
          'success',
          'Access Key cleared. The platform default will be used if configured.',
        );
      }

      try {
        await validateAccessKey(accessKey);
      } catch (error) {
        if (error instanceof UnsplashError) {
          if (error.code === 'unauthorized') {
            return result
              .addError('accessKey', 'Invalid Unsplash Access Key.')
              .addToast(
                'danger',
                'Invalid Unsplash Access Key. Verify the key at https://unsplash.com/developers.',
              );
          }
          if (error.code === 'rate_limited') {
            return result.addToast('danger', 'Unsplash rate limit reached. Try again shortly.');
          }
        }
        logger.error('Failed to validate Unsplash Access Key:', error);
        return result.addToast('danger', 'Could not reach Unsplash to verify the key. Try again.');
      }

      await storage.settings.put('credentials', {accessKey});
      return result.addToast('success', 'Unsplash Access Key saved.');
    }

    logger.warn('Unsupported section-action combination:', section, action);
    return result;
  }

  public async onAuthorizationRequest(
    _section: string,
    _formData: SubmittedFormData,
  ): Promise<LifecycleSettingsResult> {
    return new LifecycleSettingsResult().addToast('danger', 'OAuth is not supported.');
  }

  public async onAuthorizationGrant(_request: AppRequest): Promise<AuthorizationGrantResult> {
    return new AuthorizationGrantResult('').addToast('danger', 'OAuth is not supported.');
  }
}
