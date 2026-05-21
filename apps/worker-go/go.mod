module github.com/yantianqi1/image-studio/apps/worker-go

go 1.23

require (
	github.com/jackc/pgx/v5 v5.7.2
	github.com/yantianqi1/image-studio/apps/image-runtime-go v0.0.0
)

replace github.com/yantianqi1/image-studio/apps/image-runtime-go => ../image-runtime-go

require (
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	golang.org/x/crypto v0.31.0 // indirect
	golang.org/x/sync v0.10.0 // indirect
	golang.org/x/text v0.21.0 // indirect
)
