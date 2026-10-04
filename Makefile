.PHONY: addon install build test web package clean
addon: ; bash scripts/bootstrap-addon.sh
install: ; npm ci
build: ; npm run build
test: ; npm test
web: ; npm run web:build
package: ; bash scripts/package-repository.sh
clean: ; npm run clean && rm -rf .local hcw-azmigrateorchestrator-app.zip
