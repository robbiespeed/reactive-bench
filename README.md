# Reactive Compute Benchmark

A series of benchmarks and test for JS reactivity libraries.

> [!NOTE]
> This is still a work in progress and the results should not be used as definitive indicators when comparing the performance of the included reactive libraries.  
> Checks have yet to be put in place to verify the implementations are behaving correctly according to test parameters.

## Running the benchmarks

First install dependencies with pnpm.

```
pnpm i
```

### Running with Deno

Easiest way to run the benchmark is with Deno (v2), no build step is required.

```
# The bench script will run Deno with all necessary flags
pnpm bench

# Or you can run with Deno directly
deno run --v8-flags=-expose_gc --allow-env --allow-read=./packages ./bench.js
```

### Running with Node or Bun

Both Node and Bun require that the project be built first. There are convenient `bench-build:{node,bun}` scripts you can use to build then run.

```
pnpm bench-build:node
```

## Goals

To provide a pluggable benchmark suite for reactive libraries to test against and be used to improve their libraries in whichever way they deem suitable. Not all libraries have the same goals and usage patterns. With that in mind this benchmark is focused on allowing libraries to implement their own encapsulated implementations that conform to to a given benchmark interface, internally using patterns idiomatic to the given library.

The package will in the near future be slightly reworked to be published libraries, which reactive libraries can use as a dev dependency and benchmark their framework in locally in their own repo. Some of `start` will move into `core`, and what will remain are the implementations. The idea there being that if a maintainer wants only to benchmark against their versions of their own library then they can simple use `core`, but if they want a few other libraries to benchmark against then they can use `start`.

It's not a goal for this repo contain a large list of implementations, rather a small set of implementations, to keep maintenance burden low and allow implementing new benchmark cases more easily.
