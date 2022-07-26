FROM node:16-slim

# COPY . /eslint_check_action

# WORKDIR /eslint_check_action

LABEL maintainer="Krzysztof Borowy <dev@krizzu.dev>"
LABEL com.github.actions.name="ESLint check"
LABEL com.github.actions.description="Runs ESlint check in your project and annotate errors/warning in a PR."
LABEL com.github.actions.icon="octagon"
LABEL com.github.actions.color="green"

RUN ["npm", "install"]

RUN ["npm", "run", "build"]

ENTRYPOINT ["/eslint_check_action/start.sh"]
