"""Run independent tastytrade reads at the same time instead of one after another."""
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Generic, TypeVar

T = TypeVar("T")
R = TypeVar("R")

# tastytrade rate-limits per account; a handful of parallel reads is plenty for two-to-five accounts.
MAX_WORKERS = 6


def map_concurrently(fn: Callable[[T], R], items: Iterable[T], *, max_workers: int = MAX_WORKERS) -> list[R]:
    """``[fn(item) for item in items]``, run in parallel; results keep input order and the first failure is raised."""
    items = list(items)
    if len(items) <= 1:
        return [fn(item) for item in items]
    with ThreadPoolExecutor(max_workers=min(max_workers, len(items))) as pool:
        return list(pool.map(fn, items))


@dataclass(frozen=True)
class Outcome(Generic[R]):
    """A finished call: its value, or the exception it raised."""

    value: R | None = None
    error: BaseException | None = None

    def unwrap(self) -> R:
        """Return the value, or re-raise the original exception (so callers' except blocks behave as before)."""
        if self.error is not None:
            raise self.error
        return self.value  # type: ignore[return-value]


def attempt(fn: Callable[[], R]) -> Outcome[R]:
    try:
        return Outcome(value=fn())
    except Exception as exc:  # noqa: BLE001 - the caller decides how each failure is reported
        return Outcome(error=exc)


def gather(calls: dict[str, Callable[[], R]], *, max_workers: int = MAX_WORKERS) -> dict[str, Outcome[R]]:
    """Run named zero-argument calls in parallel and return every outcome, failures included."""
    names = list(calls)
    outcomes = map_concurrently(lambda name: attempt(calls[name]), names, max_workers=max_workers)
    return dict(zip(names, outcomes, strict=True))
