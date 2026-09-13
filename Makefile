.PHONY: setup db-up db-down migrate api web test check

setup:
	cd backend && go mod download
	npm --prefix frontend install

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

migrate:
	cd backend && go run ./cmd/migrate

api:
	cd backend && go run ./cmd/api

web:
	npm --prefix frontend run dev

test:
	cd backend && go test ./...

check:
	cd backend && go test ./...
	cd backend && go vet ./...
	npm --prefix frontend run test
	npm --prefix frontend run lint
	npm --prefix frontend run build
