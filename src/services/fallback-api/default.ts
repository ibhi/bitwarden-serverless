// eslint-disable-next-line
export const handler = (event, context, callback): void => {
  console.log('Fallback handler triggered', JSON.stringify(event, null, 2));
  callback(null, {
    statusCode: 404,
    body: 'Not Found',
  });
};
