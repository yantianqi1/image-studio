package provider

import (
	"errors"
	"fmt"
)

type RenderError struct {
	Code         string
	Message      string
	NonRetryable bool
	Err          error
}

func NewError(code string, message string, nonRetryable bool) error {
	return &RenderError{Code: code, Message: message, NonRetryable: nonRetryable}
}

func WrapError(code string, message string, nonRetryable bool, err error) error {
	return &RenderError{Code: code, Message: message, NonRetryable: nonRetryable, Err: err}
}

func (e *RenderError) Error() string {
	if e.Message != "" && e.Err != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Err)
	}
	if e.Message != "" {
		return e.Message
	}
	if e.Err != nil {
		return e.Err.Error()
	}
	return e.Code
}

func (e *RenderError) Unwrap() error {
	return e.Err
}

func ErrorCode(err error) string {
	var renderErr *RenderError
	if errors.As(err, &renderErr) && renderErr.Code != "" {
		return renderErr.Code
	}
	return "go_worker_render_error"
}

func IsNonRetryable(err error) bool {
	var renderErr *RenderError
	return errors.As(err, &renderErr) && renderErr.NonRetryable
}
