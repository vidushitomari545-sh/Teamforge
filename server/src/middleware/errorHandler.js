export const errorHandler = (err, req, res, _next) => {
  const statusCode = err.statusCode || err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';

  const response = {
    status: statusCode >= 500 ? 'error' : 'fail',
    message: err.message || 'Internal Server Error'
  };

  if (!isProd && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};
