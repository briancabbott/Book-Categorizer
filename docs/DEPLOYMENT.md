# Deployment targets

The browser UI and recognition pipeline are identical on every target. Only the
storage adapter changes.

## Local Node.js

Copy `.env.example` to `.env.local`, then run:

```bash
npm ci
npm run dev:local
```

`STORAGE_DRIVER=local` writes book metadata and private image files beneath
`DATA_DIR` (default `.data`). The directory is ignored by Git but is durable:
application reloads and rebuilds do not replace it. Legacy array-format data is
migrated automatically to the current versioned envelope, with the original
preserved as `books.pre-migration-v0.json`.

For a local production check:

```bash
npm run build:node
npm run start:node
```

## OpenAI Sites / Cloudflare

Use the existing commands:

```bash
npm run dev
npm run build
```

The Sites build aliases the storage boundary to the Cloudflare adapter. It uses
the existing `DB` D1 binding and `BOOK_IMAGES` R2 binding. No Node filesystem or
AWS code is loaded into the Worker.

## AWS

The portable Node build is suitable for container hosting such as AWS App
Runner, ECS/Fargate, or EKS.

1. Create storage:

   ```bash
   aws cloudformation deploy \
     --stack-name book-categorizer-storage \
     --template-file infra/aws-storage.yaml \
     --capabilities CAPABILITY_NAMED_IAM
   ```

2. Attach the stack's `RuntimePolicyArn` output to the IAM role used by the
   container. Do not configure long-lived AWS access keys.
3. Set these runtime variables:

   ```text
   STORAGE_DRIVER=aws
   AWS_REGION=<region>
   BOOKS_TABLE=<BooksTableName output>
   BOOK_IMAGES_BUCKET=<BookImagesBucketName output>
   ```

4. Build and publish the included `Dockerfile`, then deploy that image to the
   chosen AWS container service.

The AWS adapter stores book records in DynamoDB and original images in a private,
encrypted, versioned S3 bucket. Images are served through the application's
authenticated API route rather than exposed publicly.

## Storage contract

All environments implement the same three operations:

- list normalized book records;
- save a book and optional front/back images;
- stream a stored image.

Recognition is storage-independent and continues to use the same barcode, OCR,
Google Books, and Open Library pipeline everywhere.

## Data migrations

Persisted data is never reset as part of application startup. Schema changes
must be additive, numbered migrations:

- D1 migrations live in `drizzle/` and are also applied idempotently by the
  Cloudflare storage adapter so local development databases upgrade in place.
- Local filesystem records carry a `schemaVersion`; migrations preserve a
  pre-migration copy before writing the upgraded format.
- Existing columns and records must not be dropped or rewritten without a
  separately reviewed backup and migration plan.

Do not delete `.data/` or `.wrangler/state/`; they contain the local library.
