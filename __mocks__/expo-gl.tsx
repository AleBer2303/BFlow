/**
 * Jest stand-in for expo-gl, whose native module does not exist under Node.
 * The surface never creates a context on its own; tests call `onContextCreate` directly.
 */

import React from 'react';
import { View, type ViewProps } from 'react-native';

export type ExpoWebGLRenderingContext = WebGL2RenderingContext & { endFrameEXP(): void };

export interface GLViewProps extends ViewProps {
  onContextCreate?: (gl: ExpoWebGLRenderingContext) => void;
  webglContextAttributes?: WebGLContextAttributes;
  msaaSamples?: number;
}

export class GLView extends React.Component<GLViewProps> {
  render(): React.JSX.Element {
    const { onContextCreate, webglContextAttributes, msaaSamples, ...viewProps } = this.props;
    return <View {...viewProps} />;
  }
}
