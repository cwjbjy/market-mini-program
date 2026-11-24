package cn.marketkitchen.web;

import cn.marketkitchen.exception.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {
    @ExceptionHandler(BusinessException.class)
    ResponseEntity<ApiResponse<Void>> handleBusiness(BusinessException error) {
        return ResponseEntity.status(error.status())
                .body(ApiResponse.error(error.status().value(), error.getMessage()));
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    ResponseEntity<ApiResponse<Void>> handleDatabase(RuntimeException error) {
        log.error("MySQL operation failed", error);
        if (error instanceof DataAccessResourceFailureException || error instanceof TransientDataAccessException
                || error instanceof CannotCreateTransactionException) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(ApiResponse.error(503, "数据库暂时不可用，请稍后重试"));
        }
        return ResponseEntity.internalServerError().body(ApiResponse.error(500, "数据库操作失败，请稍后重试"));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiResponse<Void>> handleUnexpected(Exception error) {
        log.error("Unexpected request failure", error);
        return ResponseEntity.internalServerError().body(ApiResponse.error(500, "服务暂时不可用，请稍后重试"));
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException error,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        var first = error.getBindingResult().getFieldError();
        String message = first == null ? "请检查提交的参数" : first.getDefaultMessage();
        return super.handleExceptionInternal(error, ApiResponse.error(status.value(), message), headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception error, Object body, HttpHeaders headers,
            HttpStatusCode status, WebRequest request) {
        String message = switch (status.value()) {
            case 400 -> "请求格式不正确";
            case 404 -> "资源不存在";
            case 405 -> "请求方法不支持";
            case 413 -> "图片不能超过 10 MB";
            case 415 -> "请求内容格式不支持";
            default -> status.is5xxServerError() ? "服务暂时不可用，请稍后重试" : "请求失败";
        };
        if (error instanceof MaxUploadSizeExceededException) {
            message = "图片不能超过 10 MB";
        }
        return super.handleExceptionInternal(error, ApiResponse.error(status.value(), message), headers, status, request);
    }
}
