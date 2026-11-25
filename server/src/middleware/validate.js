/**
 * Generic Express request body validation middleware using Zod schemas.
 * @param {import('zod').ZodSchema} schema
 */
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    const issues = result.error.issues || [];
    const errorMessages = issues.map((err) => err.message).join('; ');
    const fieldErrors = typeof result.error.flatten === 'function' ? result.error.flatten().fieldErrors : {};

    return res.status(400).json({
      status: 'fail',
      message: `Validation error: ${errorMessages}`,
      errors: fieldErrors,
    });
  }

  req.body = result.data;
  next();
};
