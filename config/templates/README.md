# Deployment configuration templates

This directory contains safe, synthetic examples only. A self-hosted clone runs `node ./bin/initialize-self-hosted-deployment.js --deployment-root <absolute-clone-root>` to copy them into ignored local `config/*.json` files. An external deployment copies and adapts them into its separate deployment root.

The resulting generic configuration is valid but has no provider lane and no Knowledge Base. An administrator must set the assistant identity, provider lanes, credentials, and Knowledge Base before it can converse.
