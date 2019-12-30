// eslint-disable-next-line
export const handler = (event, context, callback): void => {
  console.log('Icon handler triggered', JSON.stringify(event, null, 2));

  callback(null, {
    statusCode: 302,
    headers: {
      Location: `https://${event.pathParameters.domain}/favicon.ico`,
    },
  });
};
