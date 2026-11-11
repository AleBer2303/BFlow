module.exports = function (api) {
  const isTest = api.env('test');
  return {
    presets: ['babel-preset-expo'],
    // Metro enables React Compiler from app.json (`experiments.reactCompiler`), but babel-jest
    // does not tell babel-preset-expo that it supports it. Jest adds the plugin itself, with
    // the preset's options and only for app code, so tests run the same compiled components.
    plugins: isTest
      ? [
          [
            'babel-plugin-react-compiler',
            {
              target: '19',
              sources: (filename) =>
                filename.replace(/\\/g, '/').includes('/src/') &&
                !filename.includes('node_modules'),
            },
          ],
        ]
      : [],
  };
};
