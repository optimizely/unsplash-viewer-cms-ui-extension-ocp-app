import type {ExtensionContext} from '@optimizely/cms-extensibility-sdk';

export async function getExtensionMeta(context: ExtensionContext): Promise<{
  id: string;
  displayName: string;
  module: string;
  type: string;
}> {
  try {
    const definition = await context.extension.getDefinition();
    return {
      id: definition.id,
      displayName: definition.displayName,
      module: '', // definition.module,
      type: definition.type
    };
  } catch (_error) {
    return {
      id: 'unknown',
      displayName: 'unknown',
      module: 'unknown',
      type: 'unknown'
    };
  }
}
