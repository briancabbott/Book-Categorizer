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
`DATA_DIR` (default `.data`). The directory is ignored by Git.

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
