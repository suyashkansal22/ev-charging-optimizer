# NOTE: build context is the repo ROOT (see docker-compose.yml: api.build.context: .)
# so this image can compile the sibling engine/ into a Python module and ship it.

# ---- Stage 1: compile the C++ optimisation engine into a CPython module --------
# Same python base as the runtime stage so the extension matches the 3.11 ABI.
FROM python:3.11-slim AS engine-builder
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir pybind11
WORKDIR /engine
COPY engine/ ./
RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
        -Dpybind11_DIR="$(python -m pybind11 --cmakedir)" \
    && cmake --build build -j --config Release
# -> /engine/build/ev_engine.cpython-311-*.so

# ---- Stage 2: the FastAPI runtime ----------------------------------------------
FROM python:3.11-slim
WORKDIR /app
COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Drop the compiled engine onto Python's import path. site-packages is used (not
# /app) on purpose: docker-compose bind-mounts ./api over /app for hot-reload,
# which would otherwise hide a module placed in /app.
COPY --from=engine-builder /engine/build/ev_engine*.so /usr/local/lib/python3.11/site-packages/
COPY api/ .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
