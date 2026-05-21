package httpapi

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/yantianqi1/image-studio/apps/image-api-go/internal/service"
)

func (h Handler) ownerFromPublicRequest(r *http.Request) (service.Owner, error) {
	owner, err := h.reader.ResolveOwner(r.Context(), service.OwnerTokens{
		UserSessionToken:      cookieValue(r, h.config.UserSessionCookieName),
		AnonymousSessionToken: cookieValue(r, h.config.AnonymousSessionCookieName),
	})
	if err != nil {
		return service.Owner{}, err
	}
	if owner.UserID != nil || owner.AnonymousSessionID != nil {
		return owner, nil
	}
	if !h.config.EnableDebugOwnerHeaders {
		return service.Owner{}, nil
	}
	return ownerFromHeaders(r)
}

func (h Handler) ownerFromCreateRequest(r *http.Request) (service.Owner, error) {
	owner, err := h.ownerFromPublicRequest(r)
	if err != nil {
		return service.Owner{}, err
	}
	if owner.UserID == nil && owner.AnonymousSessionID == nil {
		return service.Owner{}, service.ErrUnauthorized
	}
	return owner, nil
}

func (h Handler) ownerFromInternalCreateRequest(r *http.Request) (service.Owner, error) {
	owner, err := ownerFromHeaders(r)
	if err != nil {
		return service.Owner{}, err
	}
	if owner.UserID == nil && owner.AnonymousSessionID == nil {
		return service.Owner{}, service.ErrUnauthorized
	}
	return owner, nil
}

func cookieValue(r *http.Request, name string) string {
	cookie, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return cookie.Value
}

func ownerFromHeaders(r *http.Request) (service.Owner, error) {
	if raw := r.Header.Get("X-Debug-Owner-User-ID"); raw != "" {
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return service.Owner{}, fmt.Errorf("%w: invalid debug user owner", service.ErrInvalidInput)
		}
		return service.Owner{UserID: &id}, nil
	}
	if raw := r.Header.Get("X-Debug-Anonymous-Session-ID"); raw != "" {
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return service.Owner{}, fmt.Errorf("%w: invalid debug anonymous owner", service.ErrInvalidInput)
		}
		return service.Owner{AnonymousSessionID: &id}, nil
	}
	return service.Owner{}, nil
}
