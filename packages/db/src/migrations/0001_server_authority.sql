-- Greenfield reset: the pre-authority run_events shape is intentionally discarded.
DROP TABLE `run_events`;
--> statement-breakpoint
CREATE TABLE `run_events` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`revision` integer NOT NULL,
	`request_id` text NOT NULL,
	`command_kind` text NOT NULL,
	`command_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `run_events_run_revision_unique` ON `run_events` (`run_id`,`revision`);
--> statement-breakpoint
CREATE INDEX `run_events_run_revision_idx` ON `run_events` (`run_id`,`revision`);
--> statement-breakpoint
CREATE TABLE `command_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`response_json` text,
	`revision` integer,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `command_requests_user_request_unique` ON `command_requests` (`user_id`,`request_id`);
--> statement-breakpoint
CREATE INDEX `command_requests_user_idx` ON `command_requests` (`user_id`);