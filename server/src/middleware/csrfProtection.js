import { config } from '../config/env.js';

/**
 * Origin and Referer validation middleware for state-changing HTTP requests.
 * Provides defense-in-depth against Cross-Site Request Forgery (CSRF) for cookie-authenticated sessions.
 */
export const csrfProtection = (req, res, next) => {
  // Safe HTTP methods do not change state
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;

  // Extract source origin from Origin or Referer header
  let requestOrigin = null;
  if (originHeader) {
    requestOrigin = originHeader;
  } else if (refererHeader) {
    try {
      const url = new URL(refererHeader);
      requestOrigin = url.origin;
    } catch {
      requestOrigin = null;
    }
  }

  const allowedOrigin = config.clientUrl;

  // If origin is provided, it must strictly match the allowed frontend origin
  if (requestOrigin) {
    if (requestOrigin !== allowedOrigin) {
      return res.status(403).json({
        status: 'fail',
        message: 'CSRF verification failed: untrusted request origin.',
      });
    }
    return next();
  }

  // In production, state-changing requests from browsers must supply Origin or Referer
  if (config.isProduction) {
    return res.status(403).json({
      status: 'fail',
      message: 'CSRF verification failed: missing request origin.',
    });
  }

  // In development / test environments, allow requests without Origin header (e.g. Postman, cURL, Supertest)
  next();
};
