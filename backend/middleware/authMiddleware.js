const jwt = require("jsonwebtoken");
const { AppError } = require("./errorMiddleware");

/**
 * Verify JWT Bearer token and attach authenticated user payload to req.user.
 */
function protect(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new AppError("Authentication required. Please sign in.", 401));
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return next(new AppError("Authentication token missing.", 401));
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return next(new AppError("Server JWT configuration is missing.", 500));
  }

  try {
    const decoded = jwt.verify(token, secret);
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name
    };
    return next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return next(new AppError("Your session has expired. Please sign in again.", 401));
    }
    return next(new AppError("Invalid authentication token.", 401));
  }
}

module.exports = { protect };

