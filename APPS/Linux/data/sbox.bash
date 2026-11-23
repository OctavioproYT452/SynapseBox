# Autocompletado de «sbox» (bash). Se instala en share/bash-completion/completions/sbox
_sbox() {
  local c="${COMP_WORDS[COMP_CWORD]}"
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=($(compgen -W "login register logout server status whoami usage sessions passwd ls upload download mkdir rm mv cp share search trash sync config service daemon update gui completion version help" -- "$c"))
  else
    case "${COMP_WORDS[1]}" in
      sync) COMPREPLY=($(compgen -W "now status on off reset folder" -- "$c")) ;;
      config) COMPREPLY=($(compgen -W "list get set reset" -- "$c")) ;;
      service) COMPREPLY=($(compgen -W "on off status" -- "$c")) ;;
      update) COMPREPLY=($(compgen -W "check install auto" -- "$c")) ;;
      trash) COMPREPLY=($(compgen -W "list restore empty" -- "$c")) ;;
      sessions) COMPREPLY=($(compgen -W "list revoke revoke-others" -- "$c")) ;;
      *) COMPREPLY=($(compgen -f -- "$c")) ;;
    esac
  fi
}
complete -F _sbox sbox
