.DEFAULT_GOAL := help
PYTHON ?= api/.venv/bin/python
REF ?= $(shell git rev-parse --verify HEAD)

.PHONY: help setup test test-api test-ui check contracts contracts-update dev deploy status
help:
	@echo 'setup             Install locked API and UI development dependencies'
	@echo 'test              Run API and UI tests using installed dependencies'
	@echo 'test-api          Run API tests (ARGS="..." for pytest options)'
	@echo 'test-ui           Type-check and run UI tests (ARGS="..." for Angular options)'
	@echo 'check             Run the complete deployment gate, including clean installs'
	@echo 'contracts         Verify generated research contracts against the sibling pipeline'
	@echo 'contracts-update  Regenerate contracts after a pipeline contract change'
	@echo 'dev               Start the Angular development server with the existing API proxy'
	@echo 'deploy            Run the gate, backup, deploy to mini, and check health (default: current commit; REF=...)'
	@echo 'status            Show mini revision and service health'

setup:
	python3 -m venv api/.venv
	$(PYTHON) -m pip install --require-hashes -r api/requirements-dev.txt
	npm --prefix ui ci

test: test-api test-ui

test-api:
	PYTHONPATH=api $(PYTHON) -m pytest api/tests -q $(ARGS)

test-ui:
	cd ui && npm exec -- tsc -p tsconfig.spec.json --noEmit
	npm --prefix ui test -- --watch=false $(ARGS)

check:
	./scripts/check-local.sh

contracts:
	$(MAKE) -C ../market-data-pipeline contracts

contracts-update:
	$(MAKE) -C ../market-data-pipeline contracts-update

dev:
	npm --prefix ui start

deploy:
	./scripts/mini-ops.sh deploy "$(REF)"

status:
	./scripts/mini-ops.sh status
