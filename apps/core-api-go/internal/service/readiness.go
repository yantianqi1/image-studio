package service

import "context"

type ReadyChecker interface {
	Check(context.Context) error
}

type Status struct {
	Status string `json:"status"`
}
