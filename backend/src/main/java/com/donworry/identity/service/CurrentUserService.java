package com.donworry.identity.service;

import com.donworry.identity.api.CurrentUser;
import com.donworry.identity.security.SessionUser;
import java.util.Optional;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

@Service
public class CurrentUserService implements CurrentUser {

    @Override
    public Optional<UserView> get() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof SessionUser user)) {
            return Optional.empty();
        }
        return Optional.of(new UserView(user.userId(), user.role().name(), user.merchantId()));
    }
}
