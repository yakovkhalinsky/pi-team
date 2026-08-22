/**
 * Seconds-granularity timestamp used in backup filenames. Seconds are included
 * so two commands fired inside the same minute don't collide — the suffix loop
 * in `backupExisting` then only handles same-second collisions (rare, bounded).
 */
export declare function formatBackupTimestamp(now: Date): string;
/**
 * Copy the file at `path` to `<timestamp>-<basename>` in the same directory,
 * returning the backup path. The ORIGINAL file is preserved on disk — callers
 * are responsible for any subsequent atomic overwrite via `atomicWriteFileSync`.
 *
 * Safety properties:
 *  - `copyFileSync(..., COPYFILE_EXCL)` guarantees we never silently overwrite
 *    a sibling backup. Two concurrent `/team-init --force` runs that land in
 *    the same second race on the timestamped name, and the loser gets a
 *    suffix instead of clobbering the winner's backup.
 *  - The original file stays in place the whole time. Pre-fix, backup used
 *    `renameSync` which atomically moved the original away; a crash between
 *    the rename and the new write left the user with no active config.
 *  - Bounded retry: 100 same-second suffixes is the ceiling, then we throw
 *    rather than loop forever.
 */
export declare function backupExisting(path: string, now?: Date): string;
/**
 * Write `body` to `path` atomically: stage to `<path>.tmp.<pid>.<ts>`, fsync
 * the write by virtue of `renameSync` being atomic within a filesystem, then
 * rename into place. A crash before the rename leaves the original file
 * untouched. Used by `/team-init` and `/team-enable` to avoid the
 * `writeFileSync(path, ...)` truncate-then-write window that would leave the
 * config empty on ctrl-C mid-write.
 */
export declare function atomicWriteFileSync(path: string, body: string, options?: {
    mode?: number;
}): void;
