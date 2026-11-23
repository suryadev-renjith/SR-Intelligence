ALTER TABLE `conversations` ADD `isFavorite` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `shareToken` varchar(64);--> statement-breakpoint
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_shareToken_unique` UNIQUE(`shareToken`);