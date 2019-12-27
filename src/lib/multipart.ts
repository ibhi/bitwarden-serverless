const prefixBoundary = '\r\n--';
const delimData = '\r\n\r\n';

function getValueIgnoringKeyCase(object, key) {
  const foundKey: any = Object.keys(object)
    .find(currentKey => currentKey.toLocaleLowerCase() === key.toLowerCase());

  return object[foundKey];
}

const defaultResult = { files: {}, fields: {} };

/**
 * Split gently
 * @param {String} str
 * @param {String} delim
 * @return {Array<String>}
 */
const split = (str, delim) => [
  str.substring(0, str.indexOf(delim)),
  str.substring(str.indexOf(delim) + delim.length),
];

export const parseMultipart = (event) => {
  const deviceType = getValueIgnoringKeyCase(event.headers, 'Device-Type');
  let boundary;
  if (deviceType === '0') { // mobile app
    boundary = prefixBoundary + getValueIgnoringKeyCase(event.headers, 'Content-Type').split('=')[1].replace(/^"(.*)"$/, '$1');
  } else {
    boundary = prefixBoundary + getValueIgnoringKeyCase(event.headers, 'Content-Type').split('=')[1];
  }
  if (!boundary) {
    return defaultResult;
  }
  const data = (event.isBase64Encoded === false
    ? event.body
    : Buffer.from(event.body, 'base64').toString('binary'));
  return data.split(boundary)
    .filter(item => item.indexOf('Content-Disposition: form-data') !== -1)
    .map((item) => {
      const tmp = split(item, delimData);
      const header = tmp[0];
      let content = tmp[1];
      let name;
      if (deviceType === '0') { // mobile app
        [, name] = header.match(/name=(\w+)(;?)/);
      } else {
        [, name] = header.match(/name="([^"]+)"/);
      }
      const result = {};
      result[name] = content;
      if (header.indexOf('filename') !== -1) {
        const filename = header.match(/filename="([^"]+)"/)[1];
        let [, contentType] = header.match(/Content-Type: (.+)/);
        if (contentType) {
          if (contentType.indexOf('text') === -1) {
            content = Buffer.from(content, 'binary'); // replace content with binary
          }
        } else { // mobile app. It has content disposition in instead of content type
          [, contentType] = header.match(/Content-Disposition: (\w+-\w+)(;?)/);
          content = Buffer.from(content, 'binary'); // replace content with binary
        }
        result[name] = {
          filename,
          contentType,
          content,
          type: 'file',
          size: content.length,
        };
      }
      return result;
    })
    .reduce((accumulator, current) => Object.assign(accumulator, current), {});
};