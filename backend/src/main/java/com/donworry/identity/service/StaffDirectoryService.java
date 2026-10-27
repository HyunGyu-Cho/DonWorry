package com.donworry.identity.service;

import com.donworry.identity.api.StaffDirectory;
import com.donworry.identity.entity.PlatformUser;
import com.donworry.identity.repository.PlatformUserRepository;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class StaffDirectoryService implements StaffDirectory {

    private final PlatformUserRepository platformUserRepository;

    @Override
    public Optional<String> displayName(Long userId) {
        return platformUserRepository.findById(userId).map(PlatformUser::getDisplayName);
    }
}
