.PHONY: install build test rules goldens packages verify web appliance package clean
install: ; npm ci
build: ; npm run build
test: ; npm test
rules: ; npm run rules:validate
goldens: ; npm run goldens:update
packages: ; npm run packages:assemble
verify: ; npm run packages:verify
web: ; npm run web:build
appliance: build ; npm run appliance:api
package: ; bash scripts/package-repository.sh
clean: ; npm run clean && rm -rf .local hcw-azmigrateorchestrator-app.zip
