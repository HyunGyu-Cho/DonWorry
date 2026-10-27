package com.donworry.identity.service;

import com.donworry.identity.api.MerchantDirectory;
import com.donworry.identity.entity.Merchant;
import com.donworry.identity.repository.MerchantRepository;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MerchantDirectoryService implements MerchantDirectory {

    private final MerchantRepository merchantRepository;

    @Override
    public Optional<MerchantView> find(Long merchantId) {
        return merchantRepository.findById(merchantId).map(MerchantDirectoryService::view);
    }

    @Override
    public Optional<MerchantView> findByCode(String merchantCode) {
        return merchantRepository.findByMerchantCode(merchantCode).map(MerchantDirectoryService::view);
    }

    private static MerchantView view(Merchant merchant) {
        return new MerchantView(merchant.getMerchantId(), merchant.getMerchantCode(), merchant.getDisplayName());
    }
}
