#!/usr/bin/env bash
# Calcola il frontier della mappa wayfinder: ticket open, sbloccati e non claimati.
# Uso: .wayfinder/frontier.sh [-a]   (-a mostra anche i bloccati e i chiusi)
set -euo pipefail

cd "$(dirname "$0")/tickets"

field() { sed -n "/^---$/,/^---$/p" "$1" | sed -n "s/^$2:[[:space:]]*//p" | head -1; }

declare -A STATUS
for f in *.md; do STATUS["$(field "$f" id)"]="$(field "$f" status)"; done

show_all=${1:-}
frontier=()

for f in *.md; do
  id="$(field "$f" id)"; st="$(field "$f" status)"; title="$(field "$f" title)"
  assignee="$(field "$f" assignee)"
  raw="$(field "$f" blocked-by)"; deps="${raw//[\[\],]/ }"

  blockers=()
  for d in $deps; do
    [[ "${STATUS[$d]:-open}" != "closed" ]] && blockers+=("$d")
  done

  if [[ "$st" == "closed" ]]; then
    [[ "$show_all" == "-a" ]] && printf '  \033[2mchiuso    %-4s %s\033[0m\n' "$id" "$title"
  elif [[ ${#blockers[@]} -gt 0 ]]; then
    [[ "$show_all" == "-a" ]] && printf '  \033[2mbloccato  %-4s %-45s ← %s\033[0m\n' \
      "$id" "$title" "${blockers[*]}"
  elif [[ -n "$assignee" ]]; then
    printf '  \033[33mclaimato  %-4s %-45s → %s\033[0m\n' "$id" "$title" "$assignee"
  else
    frontier+=("$(printf '  \033[32mLIBERO    %-4s %s\033[0m' "$id" "$title")")
  fi
done

printf '\n\033[1mFrontier — prendibili adesso:\033[0m\n'
if [[ ${#frontier[@]} -eq 0 ]]; then
  echo "  (nessuno: o la mappa è finita, o tutto è bloccato/claimato — rilancia con -a)"
else
  printf '%s\n' "${frontier[@]}"
fi
echo
