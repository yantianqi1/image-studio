package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/assetops"
	runtimedb "github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/db"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/storage"
)

const defaultVerifyLimit = 1000

type config struct {
	DatabaseURL string
	Storage     storage.Config
}

type scanFlags struct {
	Execute bool
}

type verifyFlags struct {
	Limit int
}

type rebuildFlags struct {
	MissingOnly bool
}

func main() {
	if err := run(context.Background(), os.Args[1:], os.Stdout, os.Getenv); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string, out io.Writer, getenv func(string) string) error {
	if len(args) == 0 {
		return fmt.Errorf("usage: assetctl scan-orphans|verify-assets|rebuild-thumbnails")
	}
	if !knownCommand(args[0]) {
		return fmt.Errorf("unknown assetctl command %q", args[0])
	}
	cfg, err := loadConfig(getenv)
	if err != nil {
		return err
	}
	assetStorage, repo, closeFn, err := openDependencies(ctx, cfg)
	if err != nil {
		return err
	}
	defer closeFn()
	return runCommand(ctx, commandRequest{args: args, out: out, storage: assetStorage, repo: repo})
}

type commandRequest struct {
	args    []string
	out     io.Writer
	storage storage.AssetStorage
	repo    *assetops.Repository
}

func runCommand(ctx context.Context, request commandRequest) error {
	switch request.args[0] {
	case "scan-orphans":
		return runScanOrphans(ctx, request)
	case "verify-assets":
		return runVerifyAssets(ctx, request)
	case "rebuild-thumbnails":
		return runRebuildThumbnails(ctx, request)
	default:
		return fmt.Errorf("unknown assetctl command %q", request.args[0])
	}
}

func knownCommand(command string) bool {
	switch command {
	case "scan-orphans", "verify-assets", "rebuild-thumbnails":
		return true
	default:
		return false
	}
}

func loadConfig(getenv func(string) string) (config, error) {
	databaseURL := strings.TrimSpace(getenv("DATABASE_URL"))
	if databaseURL == "" {
		return config{}, fmt.Errorf("DATABASE_URL is required")
	}
	return config{
		DatabaseURL: databaseURL,
		Storage: storage.Config{
			Backend: getenv("ASSET_STORAGE_BACKEND"), GeneratedAssetsDir: getenv("GENERATED_ASSETS_DIR"),
			GCSBucket: getenv("ASSET_STORAGE_GCS_BUCKET"), GCSPrefix: getenv("ASSET_STORAGE_GCS_PREFIX"),
		},
	}, nil
}

func openDependencies(
	ctx context.Context,
	cfg config,
) (storage.AssetStorage, *assetops.Repository, func(), error) {
	assetStorage, err := storage.BuildAssetStorage(cfg.Storage)
	if err != nil {
		return nil, nil, nil, err
	}
	pool, err := runtimedb.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, nil, nil, err
	}
	return assetStorage, assetops.NewRepository(pool), pool.Close, nil
}

func runScanOrphans(ctx context.Context, request commandRequest) error {
	opts, err := parseScanFlags(request.args[1:])
	if err != nil {
		return err
	}
	generatedStorage, ok := request.storage.(assetops.GeneratedAssetStorage)
	if !ok {
		return fmt.Errorf("asset storage does not support generated asset listing")
	}
	summary, err := assetops.ScanOrphans(ctx, assetops.OrphanScanRequest{
		Storage: generatedStorage, Store: request.repo, Execute: opts.Execute,
	})
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(request.out, "orphan_assets scanned=%d referenced=%d orphaned=%d deleted=%d dry_run=%t\n",
		summary.Scanned, summary.Referenced, summary.Orphaned, summary.Deleted, !opts.Execute)
	return err
}

func runVerifyAssets(ctx context.Context, request commandRequest) error {
	opts, err := parseVerifyFlags(request.args[1:])
	if err != nil {
		return err
	}
	summary, err := assetops.VerifyAssets(ctx, assetops.VerifyRequest{
		Storage: request.storage, Store: request.repo, Limit: opts.Limit,
	})
	if err != nil {
		return err
	}
	return printVerifySummary(request.out, summary)
}

func runRebuildThumbnails(ctx context.Context, request commandRequest) error {
	opts, err := parseRebuildFlags(request.args[1:])
	if err != nil {
		return err
	}
	summary, err := assetops.RebuildThumbnails(ctx, assetops.ThumbnailRebuildRequest{
		Storage: request.storage, Store: request.repo, MissingOnly: opts.MissingOnly,
	})
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(request.out, "thumbnails checked=%d rebuilt=%d updated=%d skipped=%d\n",
		summary.Checked, summary.Rebuilt, summary.Updated, summary.Skipped)
	return err
}

func parseScanFlags(args []string) (scanFlags, error) {
	flags := flag.NewFlagSet("scan-orphans", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	dryRun := flags.Bool("dry-run", false, "scan orphan generated asset files without deleting")
	execute := flags.Bool("execute", false, "delete orphan generated asset files")
	if err := flags.Parse(args); err != nil {
		return scanFlags{}, err
	}
	if *dryRun == *execute {
		return scanFlags{}, fmt.Errorf("scan-orphans requires exactly one of --dry-run or --execute")
	}
	return scanFlags{Execute: *execute}, nil
}

func parseVerifyFlags(args []string) (verifyFlags, error) {
	flags := flag.NewFlagSet("verify-assets", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	limit := flags.Int("limit", defaultVerifyLimit, "maximum live assets to verify")
	if err := flags.Parse(args); err != nil {
		return verifyFlags{}, err
	}
	if *limit <= 0 {
		return verifyFlags{}, fmt.Errorf("verify-assets --limit must be positive")
	}
	return verifyFlags{Limit: *limit}, nil
}

func parseRebuildFlags(args []string) (rebuildFlags, error) {
	flags := flag.NewFlagSet("rebuild-thumbnails", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	missingOnly := flags.Bool("missing-only", false, "only rebuild missing thumbnails")
	if err := flags.Parse(args); err != nil {
		return rebuildFlags{}, err
	}
	if !*missingOnly {
		return rebuildFlags{}, fmt.Errorf("rebuild-thumbnails currently requires --missing-only")
	}
	return rebuildFlags{MissingOnly: true}, nil
}

func printVerifySummary(out io.Writer, summary assetops.VerifySummary) error {
	_, err := fmt.Fprintf(out, "assets checked=%d missing=%d mismatched=%d\n",
		summary.Checked, summary.Missing, summary.Mismatched)
	if err != nil {
		return err
	}
	for _, issue := range summary.Issues {
		if _, err := fmt.Fprintf(out, "asset_issue id=%d key=%s kind=%s\n", issue.AssetID, issue.Key, issue.Kind); err != nil {
			return err
		}
	}
	return nil
}
