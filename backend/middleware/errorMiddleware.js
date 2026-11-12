const multer = require("multer");

class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

function notFoundHandler(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

function errorHandler(err, req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";

  if (err instanceof multer.MulterError) {
    statusCode = 400;
    if (err.code === "LIMIT_FILE_SIZE") {
      const maxMb = process.env.MAX_FILE_SIZE_MB || 20;
      message = `Uploaded file exceeds the maximum allowed size of ${maxMb} MB.`;
    } else {
      message = `File upload error: ${err.message}`;
    }
  } else if (err.code === "ER_DUP_ENTRY") {
    statusCode = 409;
    message = "A record with this unique value already exists.";
  } else if (err.code === "ECONNREFUSED" || err.code === "PROTOCOL_CONNECTION_LOST") {
    statusCode = 503;
    message = "Database connection unavailable. Please ensure MySQL is running and configured in .env.";
  }

  const response = {
    success: false,
    message
  };

  if (process.env.NODE_ENV === "development" && statusCode >= 500) {
    response.detail = err.message;
  }

  res.status(statusCode).json(response);
}

module.exports = {
  AppError,
  notFoundHandler,
  errorHandler
};

