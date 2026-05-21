package httpapi

import (
	"strconv"
	"strings"
)

func parseAdminDebugPath(path string) (int64, bool) {
	parts := strings.Split(path, "/")
	if len(parts) != 6 || parts[5] != "debug" {
		return 0, false
	}
	id, err := strconv.ParseInt(parts[4], 10, 64)
	return id, err == nil
}
